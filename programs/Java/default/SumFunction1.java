//Sum using function
//Function with arguments and no return value

class SumFunction1 {
    void sum(int a, int b) {
        int c = a + b;
        System.out.println("Sum = " + c);
    }

    public static void main(String[] args) {
        int x = 5, y = 6;
        SumFunction1 obj = new SumFunction1();
        obj.sum(x, y);
    }
}
