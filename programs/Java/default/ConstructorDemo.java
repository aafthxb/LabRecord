// Constructor Overloading

class Student
{
    public String name;
    public int roll;
    public int mark;

    Student(String a, int b)
    {
        name = a;
        roll = b;

        System.out.println("name= " + name);
        System.out.println("roll= " + roll);
    }

    Student(String a, int b, int c)
    {
        name = a;
        roll = b;
        mark = c;

        System.out.println("name= " + name);
        System.out.println("roll= " + roll);
        System.out.println("mark= " + mark);
    }
}

class ConstructorDemo
{
    public static void main(String args[])
    {
        Student m1 = new Student("athik", 2);
        Student m2 = new Student("athik", 2, 79);
    }
}