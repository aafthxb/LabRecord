//Addition using function
//C program to add two numbers using function with parameters

#include <stdio.h>

void sum(int a, int b);

int main()
{
    int x, y;
    x = 5;
    y = 6;
    
    sum(x, y);

    return 0;
}

void sum(int a, int b)
{
    int c = a + b;
    printf("sum is %d", c);
}