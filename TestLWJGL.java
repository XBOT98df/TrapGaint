import java.lang.reflect.Method;
public class TestLWJGL {
    public static void main(String[] args) throws Exception {
        Class<?> bufferClass = Class.forName("org.lwjgl.glfw.GLFWImage$Buffer");
        Method m = bufferClass.getMethod("malloc", int.class);
        System.out.println(m);
    }
}
