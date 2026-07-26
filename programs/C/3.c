//Multiplication Table
//C program to print multiplication table of a given number using for loop

#include <stdio.h>

int main()
{
    int i, a;
    
    printf("enter a number:");
    scanf("%d", &a);
    
    for(i = 1; i <= 10; i++)
    {
        printf("%d*%d=%d\n", i, a, i * a);
    }
    
    return 0;
}