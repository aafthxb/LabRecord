//Addition using function
//C program to add two numbers using function without parameters

#include <stdio.h>

void sum();

int main()
{
    sum();

    return 0;
}

void sum()
{
    int a, b, c;
    a = 10;
    b = 20;
    c = a + b;
    printf("sum is %d", c);
}