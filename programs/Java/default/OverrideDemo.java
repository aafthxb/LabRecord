// Method overriding

class Animal {
    void move() {
        System.out.println("Animal is moving");
    }
}

class Dog extends Animal {
    @Override
    void move() {
        System.out.println("Dog is running");
    }
}

public class OverrideDemo {
    public static void main(String[] args) {
        Dog d = new Dog();
        d.move();
    }
}