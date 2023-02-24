/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.amazon.aws.gcr.csdc.clickstream.server;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.core.TreeNode;
import com.fasterxml.jackson.core.io.JsonStringEncoder;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Map;
import java.util.Random;
import java.util.TimeZone;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class Utils {

    static final ObjectMapper MAPPER = new ObjectMapper();
    static final char[] LOWERCASE_LETTERS = {'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'};
    static final char[] UPPERCASE_LETTERS = {'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'};
    static final char[] NUMBERS = {'0', '1', '2', '3', '4', '5', '6', '7', '8', '9'};
    static final char[] SYMBOLS = {'!', '#', '$', '%', '&', '*', '+', '-', '.', ':', '=', '?', '^', '_'};
    private static final Logger LOGGER = LoggerFactory.getLogger(Utils.class);
    private static final DateFormat JAVASCRIPT_ISO8601 = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX");

    static {
        JAVASCRIPT_ISO8601.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    static {
        MAPPER.findAndRegisterModules();
        MAPPER.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        MAPPER.setDateFormat(JAVASCRIPT_ISO8601);
        MAPPER.setVisibility(PropertyAccessor.FIELD, JsonAutoDetect.Visibility.ANY);
        MAPPER.configure(SerializationFeature.FAIL_ON_EMPTY_BEANS, false);
        MAPPER.enable(SerializationFeature.WRITE_ENUMS_USING_TO_STRING);
        MAPPER.enable(DeserializationFeature.READ_ENUMS_USING_TO_STRING);
    }

    // We shouldn't be instantiated by callers
    private Utils() {
    }

    public static String dateToString_ISO8601(Date d) {
        return JAVASCRIPT_ISO8601.format(d);
    }
    public static String readAsString(InputStream s) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(s, StandardCharsets.UTF_8))){
            return reader.lines().collect(Collectors.joining("\n"));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public static String readJsonAsString(InputStream s) {
        try {
            return MAPPER.readTree(s).toString();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public static byte[] toJsonAsBytes(Object obj) {
        try {
            return MAPPER.writeValueAsBytes(obj);
        } catch (IOException e) {
            return null;
        }
    }

    public static String escapeJson(String json) {
        return String.valueOf(JsonStringEncoder.getInstance().quoteAsString(json));
    }

    public static String unescapeJson(String quotedJson) {
        StringBuilder json = new StringBuilder();
        int index = 0;
        while (index < quotedJson.length()) {
            char current = quotedJson.charAt(index);
            index++;
            if (current == '\\' && index < quotedJson.length()) {
                char escapedCharacter = quotedJson.charAt(index);
                index++;

                if (escapedCharacter == '"' || escapedCharacter == '\\' || escapedCharacter == '/' || escapedCharacter == '\'') {
                    // If the character after the backslash is another slash or a quote
                    // then add it to the JSON string we're building. Normal use case is
                    // that the next character should be a double quote mark.
                    json.append(escapedCharacter);
                } else if (escapedCharacter == 'n') {
                    // newline escape sequence
                    json.append('\n');
                } else if (escapedCharacter == 'r') {
                    // linefeed escape sequence
                    json.append('\r');
                } else if (escapedCharacter == 't') {
                    // tab escape sequence
                    json.append('\t');
                } else if (escapedCharacter == 'u') {
                    // unicode escape sequence should be 4 characters long
                    if ((index + 4) <= quotedJson.length()) {
                        StringBuilder hexadecimal = new StringBuilder();
                        for (char hex : quotedJson.substring(current, (current + 4)).toCharArray()) {
                            if (Character.isLetterOrDigit(hex)) {
                                hexadecimal.append(Character.toLowerCase(hex));
                            }
                        }
                        int codepoint = Integer.parseInt(hexadecimal.toString(), 16);
                        json.append((char) codepoint);
                        index += 4;
                    }
                } // ignorning bell and formfeed
            } else {
                // Non escaped, normal character
                json.append(current);
            }
        }
        return json.toString();
    }

    public static String toJson(Object obj) {
        String json = null;
        try {
            json = MAPPER.writeValueAsString(obj);
        } catch (Exception e) {
            LOGGER.error(Utils.getFullStackTrace(e));
        }
        return json;
    }

    public static <T> TreeNode toJsonTree(T convertibleObject) {
        return MAPPER.valueToTree(convertibleObject);
    }

    public static String toQuotedJson(Object obj) {
        return escapeJson(toJson(obj));
    }

    public static <T> T fromQuotedJson(String json, Class<T> serializeTo) {
        return fromJson(unescapeJson(json), serializeTo);
    }

    public static <T> T fromJson(String json, Class<T> serializeTo) {
        T object = null;
        try {
            object = MAPPER.readValue(json, serializeTo);
        } catch (Exception e) {
            LOGGER.error(Utils.getFullStackTrace(e));
        }
        return object;
    }

    public static <T> T fromJson(InputStream json, Class<T> serializeTo) {
        T object = null;
        try {
            object = MAPPER.readValue(json, serializeTo);
        } catch (Exception e) {
            LOGGER.error(Utils.getFullStackTrace(e));
        }
        return object;
    }

    public static boolean isEmpty(String str) {
        return (str == null || str.isEmpty());
    }

    public static boolean isBlank(String str) {
        return (str == null || str.isBlank());
    }

    public static boolean isNotEmpty(String str) {
        return !isEmpty(str);
    }

    public static boolean isNotBlank(String str) {
        return !isBlank(str);
    }


    public static String randomString(int length) {
        return randomString(length, null);
    }

    public static String randomString(int length, String allowedCharactersRegex) {
        if (length < 1) {
            throw new IllegalArgumentException("Minimum length is 1");
        }
        if (Utils.isBlank(allowedCharactersRegex)) {
            allowedCharactersRegex = "[^A-Za-z0-9]";
        }
        final Pattern regex = Pattern.compile(allowedCharactersRegex);
        final char[][] chars = {UPPERCASE_LETTERS, LOWERCASE_LETTERS, NUMBERS, SYMBOLS};
        Random random = new Random();
        StringBuilder buffer = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            int bucket = random.nextInt(chars.length);
            buffer.append(chars[bucket][random.nextInt(chars[bucket].length)]);
        }
        char[] randomCharacters = buffer.toString().toCharArray();
        for (int ch = 0; ch < randomCharacters.length; ch++) {
            if (regex.matcher(String.valueOf(randomCharacters[ch])).matches()) {
                //LOGGER.info("Found unallowed character {}", randomCharacters[ch]);
                // Replace this character with one that's allowed
                while (true) {
                    int bucket = random.nextInt(chars.length);
                    char candidate = chars[bucket][random.nextInt(chars[bucket].length)];
                    if (!regex.matcher(String.valueOf(candidate)).matches()) {
                        //LOGGER.info("Replacing with {}", candidate);
                        randomCharacters[ch] = candidate;
                        break;
                    }
                    //LOGGER.info("Candidate {} is not allowed. Trying again.", candidate);
                }
            }
        }
        return String.valueOf(randomCharacters);
    }

    public static String getFullStackTrace(Exception e) {
        final StringWriter sw = new StringWriter();
        final PrintWriter pw = new PrintWriter(sw, true);
        e.printStackTrace(pw);
        return sw.getBuffer().toString();
    }

    public static void logRequestEvent(Map<String, Object> event) {
        LOGGER.info(toJson(event));
    }

    public static boolean nullableEquals(Object o1, Object o2) {
        // same reference or both null
        if (o1 == o2) {
            return true;
        }

        // if one is null but they aren't the same reference, they aren't equal
        if (o1 == null || o2 == null) {
            return false;
        }

        // if not the same class, not equal
        if (o1.getClass() != o2.getClass()) {
            return false;
        }

        return o1.equals(o2);
    }
}
