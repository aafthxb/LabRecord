//Method overloading
//Volume of cube, cuboid, and cylinder using method overloading

class Volume_Calculation
{
    void volume(int s)
    {
        System.out.println("Volume of Cube = " + (s * s * s));
    }

    void volume(int l, int b, int h) {
        System.out.println("Volume of Cuboid = " + (l * b * h));
    }

    void volume(float r, float h) {
        System.out.println("Volume of Cylinder = " + (3.14 * r * r * h));
    }
}

public class VolumeDemo {
    public static void main(String[] args) {

        Volume_Calculation v1 = new Volume_Calculation();

        v1.volume(3);
        v1.volume(3, 4, 5);
        v1.volume(3.0f, 5.0f);
    }
}
