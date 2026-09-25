//Single inheritance

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

class EMPpers
{
    public static void main(String args[])
    {
        EMP_pers Emp1 = new EMP_pers();

        Emp1.get_values(1, "sura");
        Emp1.get(11223344, "cptvk");

        System.out.println("Employee Details\n");
        Emp1.display();
        Emp1.display2();
    }
}