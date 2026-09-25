//Employee Details
//Details of multiple employees using for loop

import java.util.Scanner;

public class EmployeeDemodetails {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);

        System.out.print("Enter number of employees: ");
        int n = sc.nextInt();

        for (int i = 1; i <= n; i++) {
            System.out.println("Employee " + i);

            System.out.print("Enter Name: ");
            String name = sc.next();

            System.out.print("Enter ID: ");
            int id = sc.nextInt();

            System.out.print("Enter Salary: ");
            float salary = sc.nextFloat();

            System.out.println("\nEmployee Details");
            System.out.println("Name: " + name);
            System.out.println("ID: " + id);
            System.out.println("Salary: " + salary);
            System.out.println();
        }

        sc.close();
    }
}
