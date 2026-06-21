package org.lwjgl.dragon.cursor;

import java.lang.instrument.Instrumentation;
import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.asm.Advice;
import net.bytebuddy.matcher.ElementMatchers;

public class DragonCursorAgent {
    public static void premain(String args, Instrumentation inst) {
        try {
            new AgentBuilder.Default()
                .with(AgentBuilder.Listener.StreamWriting.toSystemOut().withErrorsOnly())
                // Hook LWJGL 3 (1.13+)
                .type(ElementMatchers.named("org.lwjgl.glfw.GLFW"))
                .transform((builder, typeDescription, classLoader, module, protectionDomain) -> builder
                    .visit(Advice.to(GlfwCreateWindowAdvice.class).on(ElementMatchers.named("glfwCreateWindow")))
                    .visit(Advice.to(GlfwShowWindowAdvice.class).on(ElementMatchers.named("glfwShowWindow")))
                    .visit(Advice.to(GlfwSetCursorAdvice.class).on(ElementMatchers.named("glfwSetCursor")))
                    .visit(Advice.to(GlfwCreateStandardCursorAdvice.class).on(ElementMatchers.named("glfwCreateStandardCursor")))
                    .visit(Advice.to(GlfwDestroyCursorAdvice.class).on(ElementMatchers.named("glfwDestroyCursor")))
                )
                // Hook LWJGL 2 (1.12.2 and older) - Hook Mouse.create() instead of Display.create()
                .type(ElementMatchers.named("org.lwjgl.input.Mouse"))
                .transform((builder, typeDescription, classLoader, module, protectionDomain) -> builder
                    .visit(Advice.to(Lwjgl2MouseCreateAdvice.class).on(ElementMatchers.named("create")))
                )
                .installOn(inst);
        } catch (Throwable t) { }
    }

    public static class Lwjgl2MouseCreateAdvice {
        @Advice.OnMethodExit
        public static void onExit() {
            if (System.getProperty("dragon.cursor.lwjgl2.initialized") != null) return;
            System.setProperty("dragon.cursor.lwjgl2.initialized", "true");

            try {
                String path = System.getProperty("dragon.cursor.image");
                if (path != null) {
                    java.io.File file = new java.io.File(path);
                    if (file.exists()) {
                        byte[] bytes = new byte[(int)file.length()];
                        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) { fis.read(bytes); }
                        
                        int size = 64;
                        try { size = Integer.parseInt(System.getProperty("dragon.cursor.size", "64")); } catch(Exception e) {}
                        
                        if (bytes.length >= 4 * size * size) {
                            java.nio.IntBuffer intBuffer = java.nio.ByteBuffer.allocateDirect(bytes.length).order(java.nio.ByteOrder.nativeOrder()).asIntBuffer();
                            // Convert RGBA to ARGB and apply Vertical Flip (LWJGL 2 expects bottom-up)
                            for (int y = 0; y < size; y++) {
                                for (int x = 0; x < size; x++) {
                                    int srcIndex = (y * size + x) * 4;
                                    int destY = size - 1 - y;
                                    int destIndex = destY * size + x;
                                    
                                    int r = bytes[srcIndex] & 0xFF;
                                    int g = bytes[srcIndex + 1] & 0xFF;
                                    int b = bytes[srcIndex + 2] & 0xFF;
                                    int a = bytes[srcIndex + 3] & 0xFF;
                                    int argb = (a << 24) | (r << 16) | (g << 8) | b;
                                    intBuffer.put(destIndex, argb);
                                }
                            }

                            Class<?> cursorClass = Class.forName("org.lwjgl.input.Cursor");
                            Class<?> mouseClass = Class.forName("org.lwjgl.input.Mouse");
                            
                            // Hotspot is relative to bottom-left in LWJGL 2, so top-left is (0, size - 1)
                            Object cursorObj = cursorClass.getConstructor(int.class, int.class, int.class, int.class, int.class, java.nio.IntBuffer.class, java.nio.IntBuffer.class)
                                                          .newInstance(size, size, 0, size - 1, 1, intBuffer, null);
                                                          
                            mouseClass.getMethod("setNativeCursor", cursorClass).invoke(null, cursorObj);
                        }
                    }
                }
            } catch (Throwable t) {
                try {
                    java.io.PrintWriter pw = new java.io.PrintWriter(new java.io.FileWriter("/Users/kelpie/dragon_cursor_error.txt", true));
                    pw.println("Lwjgl2MouseCreateAdvice Exception:");
                    t.printStackTrace(pw);
                    pw.close();
                } catch (Exception ex) {}
            }
        }
    }

    public static class GlfwCreateWindowAdvice {
        @Advice.OnMethodExit
        public static void onExit(@Advice.Return long windowHandle) {
            if (windowHandle == 0L) return;
            if (System.getProperty("dragon.cursor.initialized") != null) return;
            System.setProperty("dragon.cursor.initialized", "true");

            try {
                String path = System.getProperty("dragon.cursor.image");
                if (path != null) {
                    java.io.File file = new java.io.File(path);
                    if (file.exists()) {
                        byte[] bytes = new byte[(int)file.length()];
                        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) { fis.read(bytes); }
                        
                        int size = 64;
                        try { size = Integer.parseInt(System.getProperty("dragon.cursor.size", "64")); } catch(Exception e) {}
                        
                        if (bytes.length >= 4 * size * size) {
                            java.nio.ByteBuffer rgbaBuffer = java.nio.ByteBuffer.allocateDirect(bytes.length);
                            rgbaBuffer.put(bytes);
                            rgbaBuffer.flip();

                            Class<?> glfwClass = Class.forName("org.lwjgl.glfw.GLFW");
                            Class<?> imageClass = Class.forName("org.lwjgl.glfw.GLFWImage");
                            
                            Object imageObj = imageClass.getMethod("malloc").invoke(null);
                            imageClass.getMethod("set", int.class, int.class, java.nio.ByteBuffer.class).invoke(imageObj, size, size, rgbaBuffer);
                            
                            long cursorHandle = (Long) glfwClass.getMethod("glfwCreateCursor", imageClass, int.class, int.class).invoke(null, imageObj, 0, 0);
                            if (cursorHandle != 0L) {
                                System.setProperty("dragon.cursor.custom.handle", String.valueOf(cursorHandle));
                                glfwClass.getMethod("glfwSetCursor", long.class, long.class).invoke(null, windowHandle, cursorHandle);
                            }
                            
                            try { imageClass.getMethod("free").invoke(imageObj); } catch (Exception e) { try { imageClass.getMethod("close").invoke(imageObj); } catch (Exception ignored) { } }
                        }
                    }
                }

                String pointerPath = System.getProperty("dragon.pointer.image");
                if (pointerPath != null) {
                    java.io.File file = new java.io.File(pointerPath);
                    if (file.exists()) {
                        byte[] bytes = new byte[(int)file.length()];
                        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) { fis.read(bytes); }
                        
                        int size = 64;
                        try { size = Integer.parseInt(System.getProperty("dragon.cursor.size", "64")); } catch(Exception e) {}
                        
                        if (bytes.length >= 4 * size * size) {
                            java.nio.ByteBuffer rgbaBuffer = java.nio.ByteBuffer.allocateDirect(bytes.length);
                            rgbaBuffer.put(bytes);
                            rgbaBuffer.flip();

                            Class<?> glfwClass = Class.forName("org.lwjgl.glfw.GLFW");
                            Class<?> imageClass = Class.forName("org.lwjgl.glfw.GLFWImage");
                            
                            Object imageObj = imageClass.getMethod("malloc").invoke(null);
                            imageClass.getMethod("set", int.class, int.class, java.nio.ByteBuffer.class).invoke(imageObj, size, size, rgbaBuffer);
                            
                            long cursorHandle = (Long) glfwClass.getMethod("glfwCreateCursor", imageClass, int.class, int.class).invoke(null, imageObj, 0, 0);
                            if (cursorHandle != 0L) {
                                System.setProperty("dragon.cursor.pointer.handle", String.valueOf(cursorHandle));
                            }
                            
                            try { imageClass.getMethod("free").invoke(imageObj); } catch (Exception e) { try { imageClass.getMethod("close").invoke(imageObj); } catch (Exception ignored) { } }
                        }
                    }
                }
            } catch (Throwable t) {
                try {
                    java.io.PrintWriter pw = new java.io.PrintWriter(new java.io.FileWriter("/Users/kelpie/dragon_cursor_error.txt", true));
                    pw.println("GlfwCreateWindowAdvice Exception:");
                    t.printStackTrace(pw);
                    pw.close();
                } catch (Exception ex) {}
            }
        }
    }

    public static class GlfwShowWindowAdvice {
        @Advice.OnMethodExit
        public static void onExit(@Advice.Argument(0) long windowHandle) {
            if (windowHandle == 0L) return;
            if (System.getProperty("dragon.cursor.initialized") != null) return;
            System.setProperty("dragon.cursor.initialized", "true");

            try {
                String path = System.getProperty("dragon.cursor.image");
                if (path != null) {
                    java.io.File file = new java.io.File(path);
                    if (file.exists()) {
                        byte[] bytes = new byte[(int)file.length()];
                        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) { fis.read(bytes); }
                        
                        int size = 64;
                        try { size = Integer.parseInt(System.getProperty("dragon.cursor.size", "64")); } catch(Exception e) {}
                        
                        if (bytes.length >= 4 * size * size) {
                            java.nio.ByteBuffer rgbaBuffer = java.nio.ByteBuffer.allocateDirect(bytes.length);
                            rgbaBuffer.put(bytes);
                            rgbaBuffer.flip();

                            Class<?> glfwClass = Class.forName("org.lwjgl.glfw.GLFW");
                            Class<?> imageClass = Class.forName("org.lwjgl.glfw.GLFWImage");
                            
                            Object imageObj = imageClass.getMethod("malloc").invoke(null);
                            imageClass.getMethod("set", int.class, int.class, java.nio.ByteBuffer.class).invoke(imageObj, size, size, rgbaBuffer);
                            
                            long cursorHandle = (Long) glfwClass.getMethod("glfwCreateCursor", imageClass, int.class, int.class).invoke(null, imageObj, 0, 0);
                            if (cursorHandle != 0L) {
                                System.setProperty("dragon.cursor.custom.handle", String.valueOf(cursorHandle));
                                glfwClass.getMethod("glfwSetCursor", long.class, long.class).invoke(null, windowHandle, cursorHandle);
                            }
                            
                            try { imageClass.getMethod("free").invoke(imageObj); } catch (Exception e) { try { imageClass.getMethod("close").invoke(imageObj); } catch (Exception ignored) { } }
                        }
                    }
                }

                String pointerPath = System.getProperty("dragon.pointer.image");
                if (pointerPath != null) {
                    java.io.File file = new java.io.File(pointerPath);
                    if (file.exists()) {
                        byte[] bytes = new byte[(int)file.length()];
                        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) { fis.read(bytes); }
                        
                        int size = 64;
                        try { size = Integer.parseInt(System.getProperty("dragon.cursor.size", "64")); } catch(Exception e) {}
                        
                        if (bytes.length >= 4 * size * size) {
                            java.nio.ByteBuffer rgbaBuffer = java.nio.ByteBuffer.allocateDirect(bytes.length);
                            rgbaBuffer.put(bytes);
                            rgbaBuffer.flip();

                            Class<?> glfwClass = Class.forName("org.lwjgl.glfw.GLFW");
                            Class<?> imageClass = Class.forName("org.lwjgl.glfw.GLFWImage");
                            
                            Object imageObj = imageClass.getMethod("malloc").invoke(null);
                            imageClass.getMethod("set", int.class, int.class, java.nio.ByteBuffer.class).invoke(imageObj, size, size, rgbaBuffer);
                            
                            long cursorHandle = (Long) glfwClass.getMethod("glfwCreateCursor", imageClass, int.class, int.class).invoke(null, imageObj, 0, 0);
                            if (cursorHandle != 0L) {
                                System.setProperty("dragon.cursor.pointer.handle", String.valueOf(cursorHandle));
                            }
                            
                            try { imageClass.getMethod("free").invoke(imageObj); } catch (Exception e) { try { imageClass.getMethod("close").invoke(imageObj); } catch (Exception ignored) { } }
                        }
                    }
                }
            } catch (Throwable t) {
                try {
                    java.io.PrintWriter pw = new java.io.PrintWriter(new java.io.FileWriter("/Users/kelpie/dragon_cursor_error.txt", true));
                    pw.println("GlfwShowWindowAdvice Exception:");
                    t.printStackTrace(pw);
                    pw.close();
                } catch (Exception ex) {}
            }
        }
    }

    public static class GlfwSetCursorAdvice {
        @Advice.OnMethodEnter
        public static void onEnter(@Advice.Argument(0) long windowHandle, @Advice.Argument(value = 1, readOnly = false) long cursorHandle) {
            try {
                long customHandle = Long.parseLong(System.getProperty("dragon.cursor.custom.handle", "0"));
                long pointerHandle = Long.parseLong(System.getProperty("dragon.cursor.pointer.handle", "0"));
                long stdArrowHandle = Long.parseLong(System.getProperty("dragon.cursor.standard.arrow.handle", "0"));
                long stdHandHandle = Long.parseLong(System.getProperty("dragon.cursor.standard.hand.handle", "0"));
                
                if (cursorHandle == 0L && customHandle != 0L) {
                    cursorHandle = customHandle;
                } else if (stdArrowHandle != 0L && cursorHandle == stdArrowHandle && customHandle != 0L) {
                    cursorHandle = customHandle;
                } else if (stdHandHandle != 0L && cursorHandle == stdHandHandle && pointerHandle != 0L) {
                    cursorHandle = pointerHandle;
                }
            } catch (Throwable t) {
                try {
                    java.io.PrintWriter pw = new java.io.PrintWriter(new java.io.FileWriter("/Users/kelpie/dragon_cursor_error.txt", true));
                    pw.println("GlfwSetCursorAdvice Exception:");
                    t.printStackTrace(pw);
                    pw.close();
                } catch (Exception ex) {}
            }
        }
    }

    public static class GlfwCreateStandardCursorAdvice {
        @Advice.OnMethodExit
        public static void onExit(@Advice.Argument(0) int shape, @Advice.Return(readOnly = false) long cursorHandle) {
            try {
                if (shape == 221188) { // GLFW_HAND_CURSOR
                    if (cursorHandle != 0L) System.setProperty("dragon.cursor.standard.hand.handle", String.valueOf(cursorHandle));
                    long pointerHandle = Long.parseLong(System.getProperty("dragon.cursor.pointer.handle", "0"));
                    if (pointerHandle != 0L) cursorHandle = pointerHandle;
                } else if (shape == 221185) { // GLFW_ARROW_CURSOR
                    if (cursorHandle != 0L) System.setProperty("dragon.cursor.standard.arrow.handle", String.valueOf(cursorHandle));
                    long customHandle = Long.parseLong(System.getProperty("dragon.cursor.custom.handle", "0"));
                    if (customHandle != 0L) cursorHandle = customHandle;
                }
            } catch (Throwable t) { }
        }
    }

    public static class GlfwDestroyCursorAdvice {
        @Advice.OnMethodEnter(skipOn = Advice.OnNonDefaultValue.class, suppress = Throwable.class)
        public static boolean onEnter(@Advice.Argument(0) long cursorHandle) {
            try {
                long customHandle = Long.parseLong(System.getProperty("dragon.cursor.custom.handle", "0"));
                long pointerHandle = Long.parseLong(System.getProperty("dragon.cursor.pointer.handle", "0"));
                if (cursorHandle != 0L && (cursorHandle == customHandle || cursorHandle == pointerHandle)) {
                    return true;
                }
            } catch (Throwable t) { }
            return false;
        }
    }
}
