// File read write
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;

public class FileReadWriteExample {
    public static void main(String[] args) {
        String inputFile = "input.txt";
        String outputFile = "output.txt";

        // Using try-with-resources to automatically close streams
        try (BufferedReader reader = new BufferedReader(new FileReader(inputFile));
             BufferedWriter writer = new BufferedWriter(new FileWriter(outputFile))) {
            
            String line;
            // Read line by line until end of file
            while ((line = reader.readLine()) != null) {
                // Write each line to the output file
                writer.write(line);
                writer.newLine();
                System.out.println("Read: " + line);
            }
            System.out.println("File written successfully to " + outputFile);
            
        } catch (IOException e) {
            System.err.println("An error occurred: " + e.getMessage());
            e.printStackTrace();
        }
    }
}   