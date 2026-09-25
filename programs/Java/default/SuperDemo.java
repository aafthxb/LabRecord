// Super keyword

class Animal {
    String name = "Animal";

    Animal() {
        System.out.println("Animal constructor");
    }

    void sound() {
        System.out.println("Animal makes a sound");
    }
}

class Dog extends Animal {
    String name = "Dog";

    Dog() {
        super();
    }

    void display() {
        System.out.println(super.name);
        super.sound();
        System.out.println(name);
    }
}

public class SuperDemo {
    public static void main(String[] args) {
        Dog d = new Dog();
        d.display();
    }
}