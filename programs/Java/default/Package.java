// Package

import Calculator.Addition;

public class Package {
    public static void main(String[] args) {
        Addition a1 = new Addition(10,20);
        
        System.out.println("The sum is: " + a1.Add());
    }
}
