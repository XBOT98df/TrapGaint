import org.lwjgl.opengl.Display;
import org.lwjgl.input.Cursor;
import org.lwjgl.input.Mouse;

public class TestLWJGL2Sizes {
    public static void main(String[] args) throws Exception {
        Display.create();
        System.out.println("Min cursor size: " + Cursor.getMinCursorSize());
        System.out.println("Max cursor size: " + Cursor.getMaxCursorSize());
        System.out.println("Capabilities: " + (Cursor.getCapabilities() != 0));
        Display.destroy();
    }
}
