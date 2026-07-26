//Addition using function
//C program to add two numbers using function and return the sum with parameters

#include <stdio.h>

int sum(int, int);

int main()
{
    int r;
    r = sum(4, 7);
    printf("sum is %d", r);

    return 0;
}

int sum(int a, int b)
{
    int c;
    c = a + b;

    return c;
}