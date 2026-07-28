//Sum using function
//Function without argument and with return value

#include <stdio.h>

int sum();

int main()
{
    int r;
    r = sum();
    printf("sum is %d", r);

    return 0;
}

int sum()
{
    int a, b, c;
    a = 17;
    b = 27;
    c = a + b;
    
    return c;
}
