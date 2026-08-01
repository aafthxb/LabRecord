//Largest of 3 numbers
//C program to find the largest of three numbers

#include <stdio.h>

int main()
{
    int a, b, c;
    
    printf("enter 3 numbers:");
    scanf("%d %d %d", &a, &b, &c);
    
    if(a > b && a > c)
    {
        printf("first number is greater");
    }
    else if(b > c && b > a)
    {
        printf("second number is greater");
    }
    else
    {
        printf("third is greater");
    }
    
    return 0;
}
