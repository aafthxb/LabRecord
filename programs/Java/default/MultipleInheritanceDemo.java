// Multiple Inheritance through Interface

interface Animal {
    public void animalSound();
}

interface Pet {
    public void play();
}

class Pig implements Animal, Pet {
    public void animalSound() {
        System.out.println("The pig says: wee wee");
    }

    public void play() {
        System.out.println("The pig is playing");
    }
}

public class MultipleInheritanceDemo {
    public static void main(String[] args) {
        Pig myPig = new Pig();

        myPig.animalSound();
        myPig.play();
    }
}