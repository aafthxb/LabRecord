//Constructor parameterized

class Rect {
    public int length;
    public int breadth;

    Rect(int p, int q) {
        length = p;
        breadth = q;
    }

    int area() {
        return length * breadth;
    }
}

public class RectDemoConstructor {
    public static void main(String[] args) {
        Rect r1 = new Rect(10, 23);
        System.out.println("Area is " + r1.area());
    }
}
