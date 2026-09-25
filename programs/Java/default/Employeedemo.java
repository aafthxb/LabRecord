//Employee details
//Employee details using class in java

import java.util.Scanner;
class Employee {
    String name;
    int id;
    float salary;

    void getData() {
        Scanner sc = new Scanner(System.in);

        System.out.print("Enter Employee Name: ");
        name = sc.nextLine();

        System.out.print("Enter Employee id: ");
        id = sc.nextInt();

        System.out.print("Enter salary: ");
        salary = sc.nextFloat();
    }

    void display() {
        System.out.println("\nEmployee Details");
        System.out.println("Employee Name : " + name);
        System.out.println("Employee id : " + id);
        System.out.println("salary : " + salary);
    }
}

public class Employeedemo {
    public static void main(String args[]) {
        Employee s = new Employee();

        s.getData();
        s.display();
    }
}
