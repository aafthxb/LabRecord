//Simple calculator
//Java program to implement a simple calculator using switch

import java.util.Scanner;
public class CalculatorSwitch {
  public static void main(String[] args) {
    int a, b, choice, result;
      Scanner sc = new Scanner(System.in);

      System.out.print("Enter two numbers: ");
      a = sc.nextInt();
      b = sc.nextInt();

      System.out.println("1 = Addition");
      System.out.println("2 = Product");
      System.out.println("3 = Subtraction");
      System.out.print("Enter your choice (1, 2, or 3): ");
      choice = sc.nextInt();
      
    switch (choice) {
            case 1:
                result = a + b;
                System.out.println("Sum of two numbers = " + result);
                break;

            case 2:
                result = a * b;
                System.out.println("Product of two numbers = " + result);
                break;

            case 3:
                result = a - b;
                System.out.println("Difference of two numbers = " + result);
                break;
        
            default:
                System.out.println("Invalid choice");
        }

        sc.close();
    }
}
