import java.lang.reflect.Method;
public class TestLWJGL3 {
    public static void main(String[] args) throws Exception {
        Class<?> imageClass = Class.forName("org.lwjgl.glfw.GLFWImage");
        for (Method m : imageClass.getMethods()) {
            System.out.println(m.getName());
        }
    }
}
