//Student details
//Student details using class in java

import java.util.Scanner;
class Student {
    String name;
    String regNo;
    float mark;

    void getData() {
        Scanner sc = new Scanner(System.in);

        System.out.print("Enter Student Name: ");
        name = sc.nextLine();

        System.out.print("Enter Registration Number: ");
        regNo = sc.nextLine();

        System.out.print("Enter Mark: ");
        mark = sc.nextFloat();
    }

    void display() {
        System.out.println("\nStudent Details");
        System.out.println("Student Name : " + name);
        System.out.println("Registration No : " + regNo);
        System.out.println("Mark : " + mark);
    }
}

public class Studentdemo {
    public static void main(String args[]) {
        Student s = new Student();

        s.getData();
        s.display();
    }
}
