// Finally

class FinallyExample {
    public static void main(String[] args) {
        try {
            int a = 10;
            int b = 2;

            System.out.println("result = " + (a / b));
        } catch (ArithmeticException e) {
            System.out.println("Exception occurred");
        } finally {
            System.out.println("Finally block is executed");
        }
    }
}