//Addition using function
//C program to add two numbers using function and return the sum

#include <stdio.h>

int sum();

int main()
{
    int r;
    r = sum();
    printf("sum is %d", r);

    return 0;
}

int sum()
{
    int a, b, c;
    a = 17;
    b = 27;
    c = a + b;
    
    return c;
}