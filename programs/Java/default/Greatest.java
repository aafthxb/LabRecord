//Largest of 3 numbers
//Java program to find the largest of three numbers


import java.util.Scanner;
public class Greatest {
    public static void main(String[] args) {

        int a, b, c;
        Scanner sc = new Scanner(System.in);

        System.out.print("Enter first number: ");
        a = sc.nextInt();

        System.out.print("Enter second number: ");
        b = sc.nextInt();

        System.out.print("Enter third number: ");
        c = sc.nextInt();

        if (a > b && a > c) {
            System.out.println("First is greater");
        } 
        else if (b > c) {

            System.out.println("Second is greater");

        } else {
          System.out.println("Third is greater");
        }

        sc.close();
    }
}
