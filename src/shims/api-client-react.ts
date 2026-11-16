export const useQuery = () => ({ data: null, isLoading: false, refetch: async () => {} });
export const useMutation = () => ({ mutate: () => {}, mutateAsync: async () => ({}) });

export default { useQuery, useMutation };
