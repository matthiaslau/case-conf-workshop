"use client";

import {
  Button,
  Dialog,
  Portal,
  Stack,
  Text,
  Box,
} from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { ContactsApi, type ImportResult } from "@/lib/client/api";

export function ImportContactsDialog() {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (file: File) => ContactsApi.importCsv(file),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleImport = () => {
    if (selectedFile) {
      mutation.mutate(selectedFile);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedFile(null);
    setResult(null);
    mutation.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(e) => (e.open ? setOpen(true) : handleClose())}>
      <Dialog.Trigger asChild>
        <Button variant="outline">Import CSV</Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Import Contacts from CSV</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap={4}>
                <Text color="gray.600" fontSize="sm">
                  Upload a CSV file with contacts. The file must have an
                  &quot;Organisation&quot; column. An optional &quot;Description&quot; column
                  will also be imported if present.
                </Text>

                <Box>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    style={{ display: "block" }}
                  />
                </Box>

                {selectedFile && (
                  <Text fontSize="sm">
                    Selected: <strong>{selectedFile.name}</strong>
                  </Text>
                )}

                {mutation.error && (
                  <Box bg="red.50" p={3} borderRadius="md">
                    <Text color="red.600" fontSize="sm">
                      {mutation.error.message}
                    </Text>
                  </Box>
                )}

                {result && (
                  <Box bg={result.imported > 0 ? "green.50" : "yellow.50"} p={3} borderRadius="md">
                    <Stack gap={2}>
                      <Text fontWeight="medium">
                        {result.imported} contact{result.imported !== 1 ? "s" : ""} imported
                      </Text>
                      {result.skipped > 0 && (
                        <Text fontSize="sm" color="gray.600">
                          {result.skipped} row{result.skipped !== 1 ? "s" : ""} skipped
                        </Text>
                      )}
                      {result.errors.length > 0 && (
                        <Box maxH="100px" overflowY="auto">
                          {result.errors.slice(0, 5).map((error, i) => (
                            <Text key={i} fontSize="xs" color="gray.500">
                              {error}
                            </Text>
                          ))}
                          {result.errors.length > 5 && (
                            <Text fontSize="xs" color="gray.500">
                              ...and {result.errors.length - 5} more
                            </Text>
                          )}
                        </Box>
                      )}
                    </Stack>
                  </Box>
                )}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="ghost" onClick={handleClose}>
                  {result ? "Close" : "Cancel"}
                </Button>
              </Dialog.ActionTrigger>
              {!result && (
                <Button
                  colorScheme="blue"
                  onClick={handleImport}
                  disabled={!selectedFile}
                  loading={mutation.isPending}
                >
                  Import
                </Button>
              )}
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
