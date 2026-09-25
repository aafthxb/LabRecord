//Constructor default

class Rect {
    public int length;
    public int breadth;

    Rect() {
        length = 10;
        breadth = 23;
    }

    int area() {
        return length * breadth;
    }
}

public class RectDemoConstructordefault {
    public static void main(String[] args) {
        Rect r1 = new Rect();
        System.out.println("Area is " + r1.area());
    }
}
