//Method overloading
//Addition of two numbers and three numbers using method overloading

class Addnumber
{
public int a,b,c;
int add(int x,int y)
{
a=x;
b=y;
return a + b + c;
}
int add(int x,int y,int z)
{
a=x;
b=y;
c=z;
return a + b + c;
}
}
public class Addnumberdemo
{
public static void main(String args [])
{
Addnumber a1=new Addnumber();
System.out.println("sum of 2 number= " + a1.add(10,20));
System.out.println("sum of 3 numbers= " + a1.add(10,20,30));
}
}
