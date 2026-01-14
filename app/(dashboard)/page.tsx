"use client";

import { Box, Heading, Text, Stack, Stat } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/client/useAuth";
import { ContactsApi } from "@/lib/client/api";

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: contactsData, isLoading } = useQuery({
    queryKey: ["contacts", "count"],
    queryFn: () => ContactsApi.list(0, 1),
  });

  return (
    <Box>
      <Stack gap={6}>
        <Box>
          <Heading size="xl">
            Welcome back{user?.fullName ? `, ${user.fullName}` : ""}!
          </Heading>
          <Text color="gray.600" mt={2}>
            Manage your contacts and settings from this dashboard.
          </Text>
        </Box>

        <Box
          bg="white"
          p={6}
          borderRadius="lg"
          boxShadow="sm"
        >
          <Heading size="md" mb={4}>
            Quick Stats
          </Heading>
          <Stack direction="row" gap={8}>
            <Stat.Root>
              <Stat.Label>Total Contacts</Stat.Label>
              <Stat.ValueText>
                {isLoading ? "..." : contactsData?.count ?? 0}
              </Stat.ValueText>
              <Stat.HelpText>
                {user?.isSuperuser ? "All contacts" : "Your contacts"}
              </Stat.HelpText>
            </Stat.Root>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
