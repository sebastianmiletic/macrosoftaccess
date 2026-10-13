package org.macrosoft.access;

import com.healthmarketscience.jackcess.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Base64;

/** Creates a new Access 2016 file containing supported local table data only. */
public final class AccessWriter {
  private static String decode(String value) {
    return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
  }

  private static String read(BufferedReader reader) throws IOException {
    String line = reader.readLine();
    if (line == null) throw new EOFException("Incomplete table export payload");
    return line;
  }

  private static int count(BufferedReader reader) throws IOException {
    int value = Integer.parseInt(read(reader));
    if (value < 0 || value > 1_000_000) throw new IOException("Invalid export item count");
    return value;
  }

  private static DataType fieldType(String affinity) throws IOException {
    switch (affinity) {
      case "INTEGER": return DataType.LONG;
      case "REAL": return DataType.DOUBLE;
      case "TEXT": return DataType.MEMO;
      default: throw new IOException("Unsupported SQLite type for Access export: " + affinity);
    }
  }

  private static Object cell(String token, DataType type) throws IOException {
    if (token.equals("N")) return null;
    if (!token.startsWith("V")) throw new IOException("Invalid cell encoding");
    String value = decode(token.substring(1));
    try {
      if (type == DataType.LONG) return Integer.parseInt(value);
      if (type == DataType.DOUBLE) {
        double number = Double.parseDouble(value);
        if (!Double.isFinite(number)) throw new NumberFormatException("non-finite number");
        return number;
      }
      return value;
    } catch (NumberFormatException error) {
      throw new IOException("A numeric value cannot be represented in Access without loss: " + value, error);
    }
  }

  public static void main(String[] args) throws Exception {
    if (args.length != 2) throw new IllegalArgumentException("Expected payload and destination paths");
    Path destination = Path.of(args[1]);
    if (Files.exists(destination)) throw new IOException("Destination already exists");
    try (BufferedReader reader = Files.newBufferedReader(Path.of(args[0]), StandardCharsets.UTF_8)) {
      if (!read(reader).equals("MDA-TABLES-1")) throw new IOException("Unsupported export payload version");
      try (Database database = DatabaseBuilder.create(Database.FileFormat.V2016, destination.toFile())) {
        int tableCount = count(reader);
        for (int t = 0; t < tableCount; t++) {
          String name = decode(read(reader));
          TableBuilder builder = new TableBuilder(name);
          int columnCount = count(reader);
          if (columnCount == 0) throw new IOException("Table has no fields: " + name);
          DataType[] types = new DataType[columnCount];
          for (int c = 0; c < columnCount; c++) {
            String column = decode(read(reader));
            types[c] = fieldType(read(reader));
            builder.addColumn(new ColumnBuilder(column, types[c]));
          }
          Table table = builder.toTable(database);
          int rowCount = count(reader);
          for (int r = 0; r < rowCount; r++) {
            Object[] values = new Object[columnCount];
            for (int c = 0; c < columnCount; c++) values[c] = cell(read(reader), types[c]);
            table.addRow(values);
          }
        }
        if (reader.readLine() != null) throw new IOException("Unexpected trailing export data");
      }
    } catch (Exception error) {
      Files.deleteIfExists(destination);
      throw error;
    }
  }
}
