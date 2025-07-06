import React, { useEffect, useState } from 'react';
import { Box, H1, H2, Text, Illustration, IllustrationProps, Table, TableRow, TableCell, TableHead, TableBody } from '@adminjs/design-system';
import { ApiClient } from 'adminjs';

const api = new ApiClient();

const Dashboard = () => {
  const [data, setData] = useState({
    userCount: 0,
    groupCount: 0,
    listingCount: 0,
    subscriptionCount: 0,
    boostCount: 0,
    recentSubscriptions: [],
    recentBoosts: []
  });
  
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch dashboard data
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        
        // Get counts
        const response = await api.getDashboard();
        
        // Get recent subscriptions
        const subscriptionsResponse = await api.resourceAction({
          resourceId: 'user_subscriptions',
          actionName: 'list',
          params: {
            perPage: 5,
            sort: { direction: 'desc', sortBy: 'created_at' }
          }
        });
        
        // Get recent boosts
        const boostsResponse = await api.resourceAction({
          resourceId: 'listing_boosts',
          actionName: 'list',
          params: {
            perPage: 5,
            sort: { direction: 'desc', sortBy: 'created_at' }
          }
        });
        
        setData({
          ...response.data,
          recentSubscriptions: subscriptionsResponse.data.records,
          recentBoosts: boostsResponse.data.records
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);

  if (isLoading) {
    return (
      <Box>
        <Text>Loading dashboard data...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Box position="relative" overflow="hidden">
        <Box bg="grey20" height={284} py={74} px={["default", "lg", 250]}>
          <Text textAlign="center" color="white">
            <H1>Welcome to WhatsApp Marketplace Admin</H1>
            <Text opacity={0.8}>Manage your marketplace, users, subscriptions and more</Text>
          </Text>
        </Box>
        <Box 
          position="absolute"
          top={-30}
          left={0}
          width="100%"
          height={320}
          style={{ transform: 'skewY(-6deg)', transformOrigin: 'top left' }}
          bg="primary100"
          opacity={0.6}
        />
      </Box>
      
      <Box mt={["xl", "xl", "-80px"]} mb="xl" mx={[0, 0, 0, "auto"]} px={["default", "lg", "xxl"]} position="relative" flex flexDirection="row" flexWrap="wrap" width={[1, 1, 1, 1024]}>
        <Box width={[1, 1/2, 1/5]} p="lg">
          <Box bg="white" p="xl" flexGrow={1} boxShadow="card">
            <Text textAlign="center">
              <H2>{data.userCount}</H2>
              <Text>Users</Text>
            </Text>
          </Box>
        </Box>
        
        <Box width={[1, 1/2, 1/5]} p="lg">
          <Box bg="white" p="xl" flexGrow={1} boxShadow="card">
            <Text textAlign="center">
              <H2>{data.groupCount}</H2>
              <Text>Groups</Text>
            </Text>
          </Box>
        </Box>
        
        <Box width={[1, 1/2, 1/5]} p="lg">
          <Box bg="white" p="xl" flexGrow={1} boxShadow="card">
            <Text textAlign="center">
              <H2>{data.listingCount}</H2>
              <Text>Listings</Text>
            </Text>
          </Box>
        </Box>
        
        <Box width={[1, 1/2, 1/5]} p="lg">
          <Box bg="white" p="xl" flexGrow={1} boxShadow="card">
            <Text textAlign="center">
              <H2>{data.subscriptionCount}</H2>
              <Text>Active Subscriptions</Text>
            </Text>
          </Box>
        </Box>
        
        <Box width={[1, 1/2, 1/5]} p="lg">
          <Box bg="white" p="xl" flexGrow={1} boxShadow="card">
            <Text textAlign="center">
              <H2>{data.boostCount}</H2>
              <Text>Active Boosts</Text>
            </Text>
          </Box>
        </Box>
      </Box>
      
      <Box mx={[0, 0, 0, "auto"]} px={["default", "lg", "xxl"]} width={[1, 1, 1, 1024]}>
        <Box mb="xl">
          <Box mb="lg">
            <H2>Recent Subscriptions</H2>
          </Box>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Start Date</TableCell>
                <TableCell>End Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.recentSubscriptions.length > 0 ? (
                data.recentSubscriptions.map(subscription => (
                  <TableRow key={subscription.id}>
                    <TableCell>{subscription.params.user_phone}</TableCell>
                    <TableCell>{subscription.params.subscription_plan_id}</TableCell>
                    <TableCell>{subscription.params.status}</TableCell>
                    <TableCell>{new Date(subscription.params.start_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(subscription.params.end_date).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} style={{ textAlign: 'center' }}>No recent subscriptions</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
        
        <Box mb="xl">
          <Box mb="lg">
            <H2>Recent Boosts</H2>
          </Box>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Listing</TableCell>
                <TableCell>Package</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Start Date</TableCell>
                <TableCell>End Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.recentBoosts.length > 0 ? (
                data.recentBoosts.map(boost => (
                  <TableRow key={boost.id}>
                    <TableCell>{boost.params.listing_id}</TableCell>
                    <TableCell>{boost.params.boosting_package_id}</TableCell>
                    <TableCell>{boost.params.status}</TableCell>
                    <TableCell>{new Date(boost.params.start_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(boost.params.end_date).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} style={{ textAlign: 'center' }}>No recent boosts</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
};

export default Dashboard;
