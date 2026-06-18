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
    public static volatile boolean cursorsCreated = false;
    
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

    public static class GlfwSwapBuffersAdvice {
        @Advice.OnMethodEnter
        public static void onSwapBuffers(@Advice.Argument(0) long windowHandle) {
            try {
                if (!DragonCursorAgent.cursorsCreated) {
                    DragonCursorAgent.cursorsCreated = true;
                    Class<?> glfwClass = Class.forName("org.lwjgl.glfw.GLFW");
                    
                    // Create default cursor
                    File f = new File(DragonCursorAgent.cursorImagePath);
                    if (f.exists()) {
                        BufferedImage image = ImageIO.read(f);
                        if (image != null) {
                            DragonCursorAgent.customCursorHandle = createCursor(glfwClass, image);
                            if (DragonCursorAgent.customCursorHandle != 0) {
                                glfwClass.getMethod("glfwSetCursor", long.class, long.class)
                                         .invoke(null, windowHandle, DragonCursorAgent.customCursorHandle);
                            }
                        }
                    }

                    // Create pointer cursor
                    if (DragonCursorAgent.pointerImagePath != null) {
                        File pf = new File(DragonCursorAgent.pointerImagePath);
                        if (pf.exists()) {
                            BufferedImage ptrImage = ImageIO.read(pf);
                            if (ptrImage != null) {
                                DragonCursorAgent.customPointerHandle = createCursor(glfwClass, ptrImage);
                            }
                        }
                    }
                }
            } catch (Throwable t) {
                // Ignore silent errors
            }
        }
        
        public static long createCursor(Class<?> glfwClass, BufferedImage image) throws Exception {
            int originalWidth = image.getWidth();
            int originalHeight = image.getHeight();
            
            int targetWidth = 32;
            int targetHeight = 32;
            
            ByteBuffer pixels = ByteBuffer.allocateDirect(targetWidth * targetHeight * 4);
            
            // Manual nearest-neighbor scaling to completely avoid AWT Graphics2D pipeline
            for (int y = 0; y < targetHeight; y++) {
                for (int x = 0; x < targetWidth; x++) {
                    int srcX = (int)((x / (float)targetWidth) * originalWidth);
                    int srcY = (int)((y / (float)targetHeight) * originalHeight);
                    
                    // Clamp to prevent out of bounds
                    srcX = Math.min(srcX, originalWidth - 1);
                    srcY = Math.min(srcY, originalHeight - 1);
                    
                    int argb = image.getRGB(srcX, srcY);
                    
                    pixels.put((byte) ((argb >> 16) & 0xFF)); // R
                    pixels.put((byte) ((argb >> 8) & 0xFF));  // G
                    pixels.put((byte) (argb & 0xFF));         // B
                    pixels.put((byte) ((argb >> 24) & 0xFF)); // A
                }
            }
            pixels.flip();

            Class<?> glfwImageClass = Class.forName("org.lwjgl.glfw.GLFWImage");
            Object glfwImage = glfwImageClass.getMethod("malloc").invoke(null);
            glfwImageClass.getMethod("width", int.class).invoke(glfwImage, width);
            glfwImageClass.getMethod("height", int.class).invoke(glfwImage, height);
            glfwImageClass.getMethod("pixels", ByteBuffer.class).invoke(glfwImage, pixels);

            long cursorHandle = (long) glfwClass.getMethod("glfwCreateCursor", glfwImageClass, int.class, int.class)
                .invoke(null, glfwImage, 0, 0);

            try { glfwImageClass.getMethod("free").invoke(glfwImage); } catch (Exception e) {
                try { glfwImageClass.getMethod("close").invoke(glfwImage); } catch (Exception ignored) {}
            }
            return cursorHandle;
        }
    }

    public static class GlfwSetCursorAdvice {
        @Advice.OnMethodEnter
        public static void onSetCursor(@Advice.Argument(value = 1, readOnly = false) long cursor) {
            if (cursor == 0 && DragonCursorAgent.customCursorHandle != 0) {
                cursor = DragonCursorAgent.customCursorHandle;
            }
        }
    }

    public static class GlfwCreateStandardCursorAdvice {
        @Advice.OnMethodExit
        public static void onCreateStandardCursor(@Advice.Argument(0) int shape, @Advice.Return(readOnly = false) long result) {
            if (shape == 0x00036004 && DragonCursorAgent.customPointerHandle != 0) {
                result = DragonCursorAgent.customPointerHandle;
            }
            else if (shape == 0x00036001 && DragonCursorAgent.customCursorHandle != 0) {
                result = DragonCursorAgent.customCursorHandle;
            }
        }
    }

    public static class GlfwDestroyCursorAdvice {
        @Advice.OnMethodEnter(skipOn = Advice.OnNonDefaultValue.class)
        public static boolean onDestroyCursor(@Advice.Argument(0) long cursor) {
            // Prevent mods from accidentally destroying our custom persistent cursors
            if (cursor != 0 && (cursor == DragonCursorAgent.customCursorHandle || cursor == DragonCursorAgent.customPointerHandle)) {
                return true; // Skip execution of the original method
            }
            return false;
        }
    }
}
