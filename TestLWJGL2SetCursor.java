import org.lwjgl.opengl.Display;
import org.lwjgl.input.Cursor;
import org.lwjgl.input.Mouse;
import java.nio.IntBuffer;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.lang.reflect.Field;

public class TestLWJGL2SetCursor {
    public static void main(String[] args) throws Exception {
        Display.create();
        int size = 64;
        IntBuffer intBuffer = ByteBuffer.allocateDirect(4 * size * size).order(ByteOrder.nativeOrder()).asIntBuffer();
        Cursor cursor = new Cursor(size, size, 0, 0, 1, intBuffer, null);
        
        Mouse.setNativeCursor(cursor);
        System.out.println("Set cursor before Mouse.create()");
        
        Mouse.create();
        System.out.println("Mouse created.");
        
        Field currentCursorField = Mouse.class.getDeclaredField("currentCursor");
        currentCursorField.setAccessible(true);
        Cursor currentCursor = (Cursor) currentCursorField.get(null);
        System.out.println("Current cursor after Mouse.create(): " + (currentCursor == cursor ? "Custom" : (currentCursor == null ? "Null" : "Other")));
        
        Display.destroy();
    }
}
