//Area of circle
//Area of circle using class in java

class Circle
{
public int radius;
void getvalues(int p)
{
radius=p;
}
double area()
{
double ans=3.14*radius*radius;
return (ans);
}
}
class Circledemo
{
public static void main(String args[])
{
Circle c1=new Circle();
c1.getvalues(3);
System.out.println("area is "+c1.area());
}}
