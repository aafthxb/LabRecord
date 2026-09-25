//Multilevel inheritance

class Employee
{
    public int EID;
    public String Ename;

    void get_values(int A, String B)
    {
        EID = A;
        Ename = B;
    }

    void display()
    {
        System.out.println("EID= " + EID);
        System.out.println("Ename= " + Ename);
    }
}

class EMP_pers extends Employee
{
    public int aadhar;
    public String address;

    void get(int D, String C)
    {
        aadhar = D;
        address = C;
    }

    void display2()
    {
        System.out.println("aadhar no= " + aadhar);
        System.out.println("adress= " + address);
    }
}

class EMP_DEPT extends EMP_pers
{
    public String Edept;
    public int Esalary;

    void get1(String I, int G)
    {
        Edept = I;
        Esalary = G;
    }

    void display3()
    {
        System.out.println("Edept= " + Edept);
        System.out.println("Esalary= " + Esalary);
    }
}

class EMPDemo
{
    public static void main(String args[])
    {
        EMP_DEPT Emp1 = new EMP_DEPT();

        Emp1.get_values(1, "sura");
        Emp1.get(11223344, "cptvk");
        Emp1.get1("sales", 100000000);

        System.out.println("Employee Details\n");
        Emp1.display();
        Emp1.display2();
        Emp1.display3();
    }
}
