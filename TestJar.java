import java.io.File;
import java.net.URL;

public class TestJar {
    public static void main(String[] args) throws Exception {
        URL url = TestJar.class.getProtectionDomain().getCodeSource().getLocation();
        System.out.println(url.toURI().getPath());
    }
}
