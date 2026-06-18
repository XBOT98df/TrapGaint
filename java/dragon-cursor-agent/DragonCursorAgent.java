package dragon.cursor;

import java.awt.image.BufferedImage;
import java.io.File;
import java.lang.instrument.Instrumentation;
import java.nio.ByteBuffer;
import javax.imageio.ImageIO;

import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.asm.Advice;
import net.bytebuddy.matcher.ElementMatchers;

public class DragonCursorAgent {

    public static volatile long customCursorHandle = 0;
    public static volatile long customPointerHandle = 0;
    // Use an int flag so we can do atomic-style check: 0=pending, 1=done, 2=failed
    public static volatile int cursorState = 0;

    public static String cursorImagePath = null;
    public static String pointerImagePath = null;

    public static void premain(String agentArgs, Instrumentation inst) {
        cursorImagePath = System.getProperty("dragon.cursor.image");
        pointerImagePath = System.getProperty("dragon.pointer.image");

        if (cursorImagePath == null || cursorImagePath.isEmpty()) {
            System.out.println("[DragonCursor] No cursor image specified, skipping.");
            return;
        }

        System.out.println("[DragonCursor] Agent loaded. Image: " + cursorImagePath);
        if (pointerImagePath != null) {
            System.out.println("[DragonCursor] Pointer Image: " + pointerImagePath);
        }

        new AgentBuilder.Default()
            .disableClassFormatChanges()
            .with(AgentBuilder.RedefinitionStrategy.RETRANSFORMATION)
            .type(ElementMatchers.named("org.lwjgl.glfw.GLFW"))
            .transform((builder, typeDescription, classLoader, module, protectionDomain) ->
                builder
                    .visit(Advice.to(GlfwSwapBuffersAdvice.class).on(ElementMatchers.named("glfwSwapBuffers")))
                    .visit(Advice.to(GlfwSetCursorAdvice.class).on(ElementMatchers.named("glfwSetCursor")))
                    .visit(Advice.to(GlfwCreateStandardCursorAdvice.class).on(ElementMatchers.named("glfwCreateStandardCursor")))
                    .visit(Advice.to(GlfwDestroyCursorAdvice.class).on(ElementMatchers.named("glfwDestroyCursor")))
            )
            .installOn(inst);

        System.out.println("[DragonCursor] Hooked LWJGL 3 GLFW!");
    }

    /**
     * Read a PNG file and produce a direct ByteBuffer of RGBA pixels
     * using manual nearest-neighbor scaling. No AWT Graphics2D is used,
     * so this is safe on Windows where Graphics2D conflicts with GLFW.
     */
    public static ByteBuffer[] loadImagePixels(String path, int targetW, int targetH) {
        try {
            File f = new File(path);
            if (!f.exists()) return null;

            BufferedImage image = ImageIO.read(f);
            if (image == null) return null;

            int srcW = image.getWidth();
            int srcH = image.getHeight();

            // Get raw ARGB pixels from source image in one shot — fast and safe
            int[] srcPixels = new int[srcW * srcH];
            image.getRGB(0, 0, srcW, srcH, srcPixels, 0, srcW);

            // Allocate native direct buffer
            ByteBuffer buf = ByteBuffer.allocateDirect(targetW * targetH * 4);

            // Nearest-neighbor scale — no AWT pipeline involved at all
            for (int y = 0; y < targetH; y++) {
                int srcY = Math.min((int)((y / (float)targetH) * srcH), srcH - 1);
                for (int x = 0; x < targetW; x++) {
                    int srcX = Math.min((int)((x / (float)targetW) * srcW), srcW - 1);
                    int argb = srcPixels[srcY * srcW + srcX];
                    buf.put((byte) ((argb >> 16) & 0xFF)); // R
                    buf.put((byte) ((argb >> 8)  & 0xFF)); // G
                    buf.put((byte) (argb & 0xFF));          // B
                    buf.put((byte) ((argb >> 24) & 0xFF)); // A
                }
            }
            buf.flip();

            return new ByteBuffer[]{ buf };
        } catch (Throwable t) {
            System.out.println("[DragonCursor] Failed to load image: " + path + " -> " + t.getMessage());
            return null;
        }
    }

    /**
     * Create a GLFW cursor using reflection against LWJGL's GLFWImage.
     * This MUST be called on the GLFW main thread (i.e. from within glfwSwapBuffers
     * or another GLFW callback that is already on the main thread on Windows).
     */
    public static long createCursorFromBuffer(Class<?> glfwClass, ByteBuffer pixels, int w, int h) {
        try {
            Class<?> glfwImageClass = Class.forName("org.lwjgl.glfw.GLFWImage");

            // GLFWImage.malloc() — allocates off-heap, safe on any thread
            Object glfwImage = glfwImageClass.getMethod("malloc").invoke(null);
            glfwImageClass.getMethod("width",  int.class).invoke(glfwImage, w);
            glfwImageClass.getMethod("height", int.class).invoke(glfwImage, h);
            glfwImageClass.getMethod("pixels", ByteBuffer.class).invoke(glfwImage, pixels);

            long handle = (long) glfwClass.getMethod("glfwCreateCursor", glfwImageClass, int.class, int.class)
                    .invoke(null, glfwImage, 0, 0);

            // Free the struct (not the pixel data — that's in the direct ByteBuffer)
            try { glfwImageClass.getMethod("free").invoke(glfwImage); }
            catch (Exception ignored) {
                try { glfwImageClass.getMethod("close").invoke(glfwImage); } catch (Exception e2) {}
            }

            return handle;
        } catch (Throwable t) {
            System.out.println("[DragonCursor] glfwCreateCursor failed: " + t.getMessage());
            return 0;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Advice: hook glfwSwapBuffers — fires on the RENDER/MAIN thread in LWJGL,
    // which is the correct thread for GLFW calls on Windows.
    // ─────────────────────────────────────────────────────────────────────────
    public static class GlfwSwapBuffersAdvice {
        @Advice.OnMethodEnter
        public static void onSwapBuffers(@Advice.Argument(0) long windowHandle) {
            // Only run once; use compare-and-set pattern via volatile int
            if (DragonCursorAgent.cursorState != 0) return;
            DragonCursorAgent.cursorState = 1; // Mark as initialising immediately to prevent re-entry

            try {
                Class<?> glfwClass = Class.forName("org.lwjgl.glfw.GLFW");

                // Load default cursor (32x32)
                ByteBuffer[] defBuf = DragonCursorAgent.loadImagePixels(DragonCursorAgent.cursorImagePath, 32, 32);
                if (defBuf != null) {
                    long h = DragonCursorAgent.createCursorFromBuffer(glfwClass, defBuf[0], 32, 32);
                    if (h != 0) {
                        DragonCursorAgent.customCursorHandle = h;
                        // Apply cursor to window immediately — we are on the correct thread here
                        glfwClass.getMethod("glfwSetCursor", long.class, long.class)
                                 .invoke(null, windowHandle, h);
                        System.out.println("[DragonCursor] Custom cursor applied (handle=" + h + ")");
                    }
                }

                // Load pointer cursor (32x32)
                if (DragonCursorAgent.pointerImagePath != null) {
                    ByteBuffer[] ptrBuf = DragonCursorAgent.loadImagePixels(DragonCursorAgent.pointerImagePath, 32, 32);
                    if (ptrBuf != null) {
                        long ph = DragonCursorAgent.createCursorFromBuffer(glfwClass, ptrBuf[0], 32, 32);
                        if (ph != 0) {
                            DragonCursorAgent.customPointerHandle = ph;
                            System.out.println("[DragonCursor] Custom pointer cursor applied (handle=" + ph + ")");
                        }
                    }
                }

                DragonCursorAgent.cursorState = 2; // Done
            } catch (Throwable t) {
                System.out.println("[DragonCursor] Init error: " + t);
                DragonCursorAgent.cursorState = 2; // Mark done even on error so we don't retry every frame
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Advice: prevent game/mods from overriding our cursor back to default (0)
    // ─────────────────────────────────────────────────────────────────────────
    public static class GlfwSetCursorAdvice {
        @Advice.OnMethodEnter
        public static void onSetCursor(@Advice.Argument(value = 1, readOnly = false) long cursor) {
            if (cursor == 0 && DragonCursorAgent.customCursorHandle != 0) {
                cursor = DragonCursorAgent.customCursorHandle;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Advice: intercept glfwCreateStandardCursor so the pointer cursor also
    // shows our custom image instead of the OS hand/arrow.
    // ─────────────────────────────────────────────────────────────────────────
    public static class GlfwCreateStandardCursorAdvice {
        @Advice.OnMethodExit
        public static void onCreateStandardCursor(@Advice.Argument(0) int shape, @Advice.Return(readOnly = false) long result) {
            // GLFW_HAND_CURSOR = 0x00036004
            if (shape == 0x00036004 && DragonCursorAgent.customPointerHandle != 0) {
                result = DragonCursorAgent.customPointerHandle;
            }
            // GLFW_ARROW_CURSOR = 0x00036001
            else if (shape == 0x00036001 && DragonCursorAgent.customCursorHandle != 0) {
                result = DragonCursorAgent.customCursorHandle;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Advice: prevent mods from destroying our cursor handles
    // ─────────────────────────────────────────────────────────────────────────
    public static class GlfwDestroyCursorAdvice {
        @Advice.OnMethodEnter(skipOn = Advice.OnNonDefaultValue.class)
        public static boolean onDestroyCursor(@Advice.Argument(0) long cursor) {
            if (cursor != 0 &&
                (cursor == DragonCursorAgent.customCursorHandle ||
                 cursor == DragonCursorAgent.customPointerHandle)) {
                return true; // Block the destroy call
            }
            return false;
        }
    }
}
