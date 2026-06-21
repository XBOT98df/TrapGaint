import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.lang.reflect.Method;
public class TestCursor {
    public static void main(String[] args) throws Exception {
        Class<?> imageClass = Class.forName("org.lwjgl.glfw.GLFWImage");
        Object imageObj = imageClass.getMethod("malloc").invoke(null);
        
        imageClass.getMethod("width", int.class).invoke(imageObj, 64);
        imageClass.getMethod("height", int.class).invoke(imageObj, 64);
        
        int w = (Integer) imageClass.getMethod("width").invoke(imageObj);
        int h = (Integer) imageClass.getMethod("height").invoke(imageObj);
        
        System.out.println("Width: " + w + ", Height: " + h);
    }
}
