//Multiplication Table
//C program to print multiplication table of a given number using while loop

#include <stdio.h>

int main()
{
    int i, a;
    
    printf("enter a number:");
    scanf("%d", &a);
    
    i = 1;
    while(i <= 10)
    {
        printf("%d*%d=%d\n", i, a, i * a);
        i++;
    }
    
    return 0;
}