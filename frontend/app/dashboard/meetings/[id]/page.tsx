import MeetingRoom from "@/components/MeetingRoom";

export default async function MeetingRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MeetingRoom meetingId={id} />;
}
