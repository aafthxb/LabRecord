//Sum using function
//Function with no arguments and return value

class SumFunction3 {
    int sum() {
        int a = 5;
        int b = 6;
        int c = a + b;
        return c;
    }

    public static void main(String[] args) {
        SumFunction3 obj = new SumFunction3();
        int r = obj.sum();
        System.out.println("Sum = " + r);
    }
}
