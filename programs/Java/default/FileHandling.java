// File handling

import java.io.*;

class FileHandling {
    public static void main(String[] args) throws IOException {
        File file = new File("student.txt");

        file.createNewFile();

        FileWriter fw = new FileWriter(file);

        fw.write("Name: Aafthab\n");
        fw.write("Course: BCA\n");
        fw.write("College: WMO Arts and Science College");

        fw.close();

        FileReader fr = new FileReader(file);
        BufferedReader br = new BufferedReader(fr);

        String line;

        while ((line = br.readLine()) != null) {
            System.out.println(line);
        }

        br.close();
    }
}