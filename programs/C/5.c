//Simple Calculator
//C program to implement a simple calculator using switch

#include <stdio.h>

int main()
{
    int a, b, c;

    printf("enter two numbers:");
    scanf("%d %d", &a, &b);

    printf("1=addition,2=substraction,3=production\n");
    printf("enter your choice:1,2,3:");
    scanf("%d", &c);

    switch(c)
    {
        case 1:
            c = a + b;
            printf("sum of two number is:%d", c);
            break;

        case 2:
            c = a - b;
            printf("substration of numbers is:%d", c);
            break;

        case 3:
            c = a * b;
            printf("multiplication of numbers:%d", c);
            break;
    }

    return 0;
}
