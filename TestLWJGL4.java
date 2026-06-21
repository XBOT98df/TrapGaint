import java.lang.reflect.Method;
public class TestLWJGL4 {
    public static void main(String[] args) throws Exception {
        System.setProperty("org.lwjgl.librarypath", "/Users/kelpie/Library/Application Support/trapgaint/natives/1.16.5");
        Class<?> glfwClass = Class.forName("org.lwjgl.glfw.GLFW");
        for (Method m : glfwClass.getMethods()) {
            if (m.getName().equals("glfwCreateCursor")) {
                System.out.println(m);
            }
        }
    }
}
