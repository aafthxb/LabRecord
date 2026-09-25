// Addition
// Package to add 2 or 3 numbers

package Calculator;

public class Addition {
    private int result;

    // Constructor for 2 numbers
    public Addition(int a, int b) {
        this.result = a + b;
    }

    // Constructor for 3 numbers
    public Addition(int a, int b, int c) {
        this.result = a + b + c;
    }

    // Method to get the calculated result
    public int Add() {
        return this.result;
    }
}
