//Sum of two numbers
//C program to add two numbers

#include <stdio.h>

int main()
{
    int a, b, c;

    printf("enter two numbers to add:\n");
    scanf("%d %d", &a, &b);

    c = a + b;
    printf("sum of two numbers:%d", c);

    return 0;
}