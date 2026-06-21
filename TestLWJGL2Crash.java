import org.lwjgl.opengl.Display;
import org.lwjgl.input.Cursor;
import org.lwjgl.input.Mouse;
import java.nio.IntBuffer;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class TestLWJGL2Crash {
    public static void main(String[] args) throws Exception {
        System.out.println("Creating Display...");
        Display.create();
        System.out.println("Display created.");
        
        System.out.println("Creating Cursor...");
        int size = 64;
        IntBuffer intBuffer = ByteBuffer.allocateDirect(4 * size * size).order(ByteOrder.nativeOrder()).asIntBuffer();
        for (int i = 0; i < size * size; i++) {
            intBuffer.put(i, 0xFFFF0000); // Red
        }
        Cursor cursor = new Cursor(size, size, 0, 0, 1, intBuffer, null);
        System.out.println("Cursor created.");
        
        System.out.println("Calling Mouse.setNativeCursor WITHOUT Mouse.create()...");
        Mouse.setNativeCursor(cursor);
        System.out.println("Native cursor set successfully!");
        
        System.out.println("Now calling Mouse.create()...");
        Mouse.create();
        System.out.println("Mouse created successfully! No crash!");
        
        Thread.sleep(1000);
        Mouse.destroy();
        Display.destroy();
    }
}
