package org.macrosoft.access;

import com.healthmarketscience.jackcess.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.Date;
import java.util.TimeZone;

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
      case "DATETIME": return DataType.SHORT_DATE_TIME;
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
      if (type == DataType.SHORT_DATE_TIME) {
        LocalDateTime local;
        if (value.matches("\\d{4}-\\d{2}-\\d{2}")) local = LocalDate.parse(value).atStartOfDay();
        else if (value.matches("\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2})?")) local = LocalDateTime.parse(value.replace(' ', 'T'));
        else throw new IOException("Date requires ISO YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS]: " + value);
        return Date.from(local.toInstant(ZoneOffset.UTC));
      }
      return value;
    } catch (NumberFormatException | DateTimeParseException error) {
      throw new IOException("A value cannot be represented in Access without loss: " + value, error);
    }
  }

  public static void main(String[] args) throws Exception {
    if (args.length != 2) throw new IllegalArgumentException("Expected payload and destination paths");
    Path destination = Path.of(args[1]);
    if (Files.exists(destination)) throw new IOException("Destination already exists");
    try (BufferedReader reader = Files.newBufferedReader(Path.of(args[0]), StandardCharsets.UTF_8)) {
      String version = read(reader);
      if (!version.equals("MDA-TABLES-1") && !version.equals("MDA-TABLES-2")) throw new IOException("Unsupported export payload version");
      try (Database database = DatabaseBuilder.newDatabase(destination.toFile())
          .setFileFormat(Database.FileFormat.V2016).setTimeZone(TimeZone.getTimeZone("UTC")).create()) {
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
          if (version.equals("MDA-TABLES-2")) {
            int keyCount = count(reader);
            if (keyCount > columnCount) throw new IOException("Primary key contains too many fields: " + name);
            String[] keys = new String[keyCount];
            for (int key = 0; key < keyCount; key++) keys[key] = decode(read(reader));
            if (keyCount > 0) builder.setPrimaryKey(keys);
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
