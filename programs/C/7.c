//Even or Odd
//C program to check whether the number is even or odd

#include <stdio.h>

int main()
{
    int a;

    printf("enter a number:");
    scanf("%d", &a);

    if (a % 2 == 0)
    {
        printf("number is even");
    }
    else
    {
        printf("number is odd");
    }

    return 0;
}