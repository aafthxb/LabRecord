//Pyramid Pattern
//C program to print pyramid pattern using nested for loop

#include <stdio.h>

int main()
{
    int i, j, rows = 4;

    for (i = rows; i >= 1; i--)
    {
        for (j = 0; j < rows - i; j++)
        {
            printf(" ");
        }
        for (j = 1; j <= i; j++)
        {
            printf("* ");
        }
        printf("\n");
    }

    return 0;
}