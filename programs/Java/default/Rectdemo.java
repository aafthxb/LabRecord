//Area of rectangle
//Area of rectangle using class in java

class Rect
{
public int length;
public int breadth;
void getvalues(int p ,int q)
{
length=p;
breadth=q;
}
int area()
{
int ans=length*breadth;
return (ans);
}
}
class Rectdemo
{
public static void main(String args[])
{
Rect r1=new Rect();
r1.getvalues(10,2);
System.out.println("area is "+r1.area());
}}
