import org.lwjgl.glfw.GLFW;
import org.lwjgl.glfw.GLFWErrorCallback;
import org.lwjgl.glfw.GLFWErrorCallbackI;

import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;

public class GLFWErrorFilter {
    public static void premain(String args, Instrumentation inst) {
        // Schedule the callback replacement after GLFW is initialized
        Thread thread = new Thread(() -> {
            try {
                Thread.sleep(2000); // Wait for GLFW to initialize
                replaceErrorCallback();
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
        thread.setDaemon(true);
        thread.start();
    }
    
    private static void replaceErrorCallback() {
        try {
            GLFWErrorCallback original = GLFW.glfwSetErrorCallback(null);
            if (original != null) {
                GLFW.glfwSetErrorCallback((error, description) -> {
                    // Filter out error 65548 (Cocoa: Regular windows do not have icons on macOS)
                    if (error == 65548) {
                        System.out.println("[GLFWErrorFilter] Suppressed GLFW error 65548 (macOS icon error)");
                        return;
                    }
                    // Pass through other errors
                    original.invoke(error, description);
                });
                System.out.println("[GLFWErrorFilter] Successfully installed error filter");
            }
        } catch (Exception e) {
            System.err.println("[GLFWErrorFilter] Failed to install: " + e.getMessage());
        }
    }
}
